import pkg from "authorizenet";
const { APIContracts, APIControllers } = pkg;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      leadId,
      accountData,
      billingInfo,
      planName,
      amount,
      billingCycle,

      // Support BOTH:
      paymentNonce, // string
      opaqueData,   // object { dataDescriptor, dataValue }
    } = body || {};

    if (!leadId || !planName || !amount || !billingCycle || !billingInfo) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: leadId, planName, amount, billingCycle, billingInfo",
      });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Must be a positive number.",
      });
    }

    // Build opaque payload from either input style
    let dataDescriptor;
    let dataValue;

    if (opaqueData?.dataDescriptor && opaqueData?.dataValue) {
      dataDescriptor = String(opaqueData.dataDescriptor);
      dataValue = String(opaqueData.dataValue);
    } else if (typeof paymentNonce === "string" && paymentNonce.trim()) {
      dataDescriptor = "COMMON.ACCEPT.INAPP.PAYMENT";
      dataValue = paymentNonce.trim();
    } else {
      return res.status(400).json({
        success: false,
        message: "Missing payment data. Provide paymentNonce or opaqueData.",
      });
    }

    const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
    const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
    const env = (process.env.AUTHNET_ENV || "sandbox").toLowerCase();
    const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

    if (!apiLoginId || !transactionKey) {
      return res.status(500).json({
        success: false,
        message: "Server missing AUTHNET_API_LOGIN_ID / AUTHNET_TRANSACTION_KEY env vars.",
      });
    }

    // ---- Auth.Net setup ----
    const merchantAuthenticationType = new APIContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(apiLoginId);
    merchantAuthenticationType.setTransactionKey(transactionKey);

    const opaque = new APIContracts.OpaqueDataType();
    opaque.setDataDescriptor(dataDescriptor);
    opaque.setDataValue(dataValue);

    const paymentType = new APIContracts.PaymentType();
    paymentType.setOpaqueData(opaque);

    const customerAddress = new APIContracts.CustomerAddressType();
    customerAddress.setFirstName(billingInfo.firstName || "");
    customerAddress.setLastName(billingInfo.lastName || "");
    customerAddress.setAddress(billingInfo.address || "");
    customerAddress.setCity(billingInfo.city || "");
    customerAddress.setState(billingInfo.state || "");
    customerAddress.setZip(billingInfo.zip || "");

    const customer = new APIContracts.CustomerType();
    customer.setId(String(leadId));
    const email = accountData?.email || billingInfo?.email || "";
    if (email) customer.setEmail(String(email));

    const interval = new APIContracts.PaymentScheduleType.Interval();
    interval.setLength(billingCycle === "yearly" ? 12 : 1);
    interval.setUnit(APIContracts.ARBSubscriptionUnitEnum.MONTHS);

    const paymentScheduleType = new APIContracts.PaymentScheduleType();
    paymentScheduleType.setInterval(interval);
    paymentScheduleType.setTrialOccurrences(1);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + TRIAL_DAYS);
    paymentScheduleType.setStartDate(startDate.toISOString().split("T")[0]);
    paymentScheduleType.setTotalOccurrences(9999);

    const subscription = new APIContracts.ARBSubscriptionType();
    subscription.setName(`${planName} Subscription`);
    subscription.setPaymentSchedule(paymentScheduleType);
    subscription.setAmount(numericAmount);
    subscription.setTrialAmount(0.0);
    subscription.setPayment(paymentType);
    subscription.setBillTo(customerAddress);
    subscription.setCustomer(customer);

    const createRequest = new APIContracts.ARBCreateSubscriptionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setSubscription(subscription);

    const ctrl = new APIControllers.ARBCreateSubscriptionController(createRequest.getJSON());

    // Endpoints (hardcoded to avoid SDK constant differences)
    const productionEndpoint = "https://api2.authorize.net/xml/v1/request.api";
    const sandboxEndpoint = "https://apitest.authorize.net/xml/v1/request.api";
    ctrl.setEnvironment(env === "production" ? productionEndpoint : sandboxEndpoint);

    // ---- Execute controller (WAIT for it) ----
    const result = await new Promise((resolve) => {
      ctrl.execute(() => {
        try {
          const apiResponse = ctrl.getResponse();
          const response = new APIContracts.ARBCreateSubscriptionResponse(apiResponse);

          const msgs = response.getMessages?.();
          const resultCode = msgs?.getResultCode?.();
          const ok = resultCode === APIContracts.MessageTypeEnum.OK;

          const messageArr = msgs?.getMessage?.() || [];
          const messageText = Array.isArray(messageArr)
            ? messageArr.map((m) => `${m.getCode()}: ${m.getText()}`).join(" | ")
            : "";

          if (!ok) {
            return resolve({
              ok: false,
              status: 400,
              message: messageText || "Authorize.Net returned NOT OK",
            });
          }

          return resolve({
            ok: true,
            status: 200,
            subscriptionId: response.getSubscriptionId(),
          });
        } catch (e) {
          return resolve({
            ok: false,
            status: 500,
            message: e?.message || String(e),
          });
        }
      });
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      subscriptionId: result.subscriptionId,
    });
  } catch (err) {
    console.error("create-subscription fatal:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}
