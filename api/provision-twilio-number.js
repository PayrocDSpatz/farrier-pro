// Vercel serverless function - provisions a dedicated Twilio phone number for a farrier
// One-time only — if a number already exists in Firestore it is returned without purchasing a new one.
// api/provision-twilio-number.js

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  return initializeApp({ credential: cert(serviceAccount) });
}

// Primary area codes by US state — first entry is the default
const STATE_AREA_CODES = {
  AL:[{code:'205',label:'Birmingham'},{code:'251',label:'Mobile'},{code:'256',label:'Huntsville'}],
  AK:[{code:'907',label:'Statewide'}],
  AZ:[{code:'602',label:'Phoenix'},{code:'480',label:'Scottsdale/Mesa'},{code:'520',label:'Tucson'},{code:'623',label:'West Phoenix'}],
  AR:[{code:'501',label:'Little Rock'},{code:'479',label:'Fort Smith/Fayetteville'},{code:'870',label:'Northeast AR'}],
  CA:[{code:'213',label:'Los Angeles'},{code:'310',label:'West LA/Beverly Hills'},{code:'415',label:'San Francisco'},{code:'510',label:'Oakland/East Bay'},{code:'619',label:'San Diego'},{code:'714',label:'Orange County'},{code:'818',label:'San Fernando Valley'},{code:'909',label:'Inland Empire'},{code:'925',label:'East Bay/Contra Costa'}],
  CO:[{code:'303',label:'Denver'},{code:'720',label:'Denver Metro'},{code:'719',label:'Colorado Springs'},{code:'970',label:'Northern/Western CO'}],
  CT:[{code:'203',label:'Bridgeport/New Haven'},{code:'860',label:'Hartford'}],
  DE:[{code:'302',label:'Statewide'}],
  FL:[{code:'407',label:'Orlando'},{code:'561',label:'Palm Beach'},{code:'813',label:'Tampa'},{code:'954',label:'Fort Lauderdale'},{code:'305',label:'Miami'},{code:'786',label:'Miami-Dade'},{code:'754',label:'Broward County'},{code:'727',label:'St. Petersburg'},{code:'941',label:'Sarasota'},{code:'904',label:'Jacksonville'},{code:'850',label:'Tallahassee/Panhandle'},{code:'863',label:'Lakeland'}],
  GA:[{code:'404',label:'Atlanta'},{code:'678',label:'Atlanta Metro'},{code:'470',label:'Atlanta Metro'},{code:'770',label:'Atlanta Suburbs'},{code:'706',label:'Northeast GA'},{code:'912',label:'Savannah'}],
  HI:[{code:'808',label:'Statewide'}],
  ID:[{code:'208',label:'Statewide'}],
  IL:[{code:'312',label:'Chicago'},{code:'773',label:'Chicago'},{code:'847',label:'North Suburbs'},{code:'630',label:'West Suburbs'},{code:'708',label:'South Suburbs'},{code:'815',label:'Rockford/North IL'},{code:'217',label:'Springfield'},{code:'618',label:'Southern IL'}],
  IN:[{code:'317',label:'Indianapolis'},{code:'219',label:'Northwest IN'},{code:'260',label:'Fort Wayne'},{code:'574',label:'South Bend'},{code:'765',label:'Central IN'},{code:'812',label:'Southern IN'}],
  IA:[{code:'515',label:'Des Moines'},{code:'319',label:'Cedar Rapids'},{code:'563',label:'Davenport'},{code:'712',label:'Western IA'}],
  KS:[{code:'913',label:'Kansas City Area'},{code:'316',label:'Wichita'},{code:'785',label:'Topeka'},{code:'620',label:'Southern KS'}],
  KY:[{code:'502',label:'Louisville'},{code:'859',label:'Lexington'},{code:'270',label:'Western KY'},{code:'606',label:'Eastern KY'}],
  LA:[{code:'504',label:'New Orleans'},{code:'225',label:'Baton Rouge'},{code:'337',label:'Lafayette'},{code:'318',label:'Shreveport'},{code:'985',label:'Northshore/Houma'}],
  ME:[{code:'207',label:'Statewide'}],
  MD:[{code:'410',label:'Baltimore'},{code:'443',label:'Baltimore Metro'},{code:'301',label:'Western MD/Suburbs'},{code:'240',label:'Suburbs'}],
  MA:[{code:'617',label:'Boston'},{code:'857',label:'Boston'},{code:'781',label:'Boston Suburbs'},{code:'508',label:'Worcester/Cape Cod'},{code:'978',label:'North Shore'},{code:'413',label:'Springfield'}],
  MI:[{code:'313',label:'Detroit'},{code:'248',label:'Oakland County'},{code:'586',label:'Macomb County'},{code:'734',label:'Ann Arbor/Wayne'},{code:'616',label:'Grand Rapids'},{code:'517',label:'Lansing'},{code:'269',label:'Southwest MI'},{code:'989',label:'Central MI'}],
  MN:[{code:'612',label:'Minneapolis'},{code:'651',label:'St. Paul'},{code:'763',label:'Northwest Metro'},{code:'952',label:'Southwest Metro'},{code:'507',label:'Southern MN'},{code:'218',label:'Northern MN'}],
  MS:[{code:'601',label:'Jackson'},{code:'228',label:'Gulf Coast'},{code:'662',label:'Northern MS'}],
  MO:[{code:'314',label:'St. Louis'},{code:'816',label:'Kansas City'},{code:'636',label:'St. Louis Suburbs'},{code:'417',label:'Springfield'},{code:'573',label:'Columbia'}],
  MT:[{code:'406',label:'Statewide'}],
  NE:[{code:'402',label:'Omaha/Lincoln'},{code:'531',label:'Omaha'},{code:'308',label:'Western NE'}],
  NV:[{code:'702',label:'Las Vegas'},{code:'725',label:'Las Vegas Metro'},{code:'775',label:'Reno/Northern NV'}],
  NH:[{code:'603',label:'Statewide'}],
  NJ:[{code:'201',label:'Northeast NJ'},{code:'973',label:'Newark/North NJ'},{code:'732',label:'Central NJ'},{code:'609',label:'South NJ/Trenton'},{code:'856',label:'South Jersey'},{code:'908',label:'Central NJ'}],
  NM:[{code:'505',label:'Albuquerque/Santa Fe'},{code:'575',label:'Southern NM'}],
  NY:[{code:'212',label:'Manhattan'},{code:'718',label:'Brooklyn/Queens/Bronx'},{code:'914',label:'Westchester'},{code:'516',label:'Long Island'},{code:'631',label:'Long Island'},{code:'716',label:'Buffalo'},{code:'585',label:'Rochester'},{code:'518',label:'Albany'},{code:'315',label:'Syracuse'}],
  NC:[{code:'704',label:'Charlotte'},{code:'980',label:'Charlotte'},{code:'919',label:'Raleigh'},{code:'984',label:'Raleigh/Durham'},{code:'336',label:'Greensboro'},{code:'910',label:'Wilmington/Fayetteville'},{code:'828',label:'Asheville'}],
  ND:[{code:'701',label:'Statewide'}],
  OH:[{code:'614',label:'Columbus'},{code:'216',label:'Cleveland'},{code:'440',label:'Cleveland Suburbs'},{code:'513',label:'Cincinnati'},{code:'937',label:'Dayton'},{code:'419',label:'Toledo'},{code:'330',label:'Akron/Canton'}],
  OK:[{code:'405',label:'Oklahoma City'},{code:'918',label:'Tulsa'},{code:'580',label:'Southern OK'}],
  OR:[{code:'503',label:'Portland'},{code:'971',label:'Portland Metro'},{code:'541',label:'Eugene/Southern OR'}],
  PA:[{code:'215',label:'Philadelphia'},{code:'267',label:'Philadelphia'},{code:'412',label:'Pittsburgh'},{code:'717',label:'Harrisburg/Lancaster'},{code:'610',label:'Suburban Philadelphia'},{code:'570',label:'Northeast PA'},{code:'814',label:'Erie/Central PA'}],
  RI:[{code:'401',label:'Statewide'}],
  SC:[{code:'803',label:'Columbia'},{code:'864',label:'Greenville/Upstate'},{code:'843',label:'Charleston/Myrtle Beach'}],
  SD:[{code:'605',label:'Statewide'}],
  TN:[{code:'615',label:'Nashville'},{code:'901',label:'Memphis'},{code:'865',label:'Knoxville'},{code:'423',label:'Chattanooga'},{code:'731',label:'Western TN'}],
  TX:[{code:'214',label:'Dallas'},{code:'469',label:'Dallas Metro'},{code:'817',label:'Fort Worth'},{code:'713',label:'Houston'},{code:'281',label:'Houston Suburbs'},{code:'832',label:'Houston Metro'},{code:'512',label:'Austin'},{code:'737',label:'Austin Metro'},{code:'210',label:'San Antonio'},{code:'915',label:'El Paso'},{code:'806',label:'Lubbock/Amarillo'},{code:'903',label:'Northeast TX'},{code:'936',label:'East TX'},{code:'409',label:'Beaumont/SE TX'},{code:'361',label:'Corpus Christi'},{code:'956',label:'Laredo/McAllen'}],
  UT:[{code:'801',label:'Salt Lake City'},{code:'385',label:'Salt Lake Metro'},{code:'435',label:'Southern/Rural UT'}],
  VT:[{code:'802',label:'Statewide'}],
  VA:[{code:'703',label:'Northern VA/DC Suburbs'},{code:'571',label:'Northern VA'},{code:'804',label:'Richmond'},{code:'757',label:'Hampton Roads/Virginia Beach'},{code:'540',label:'Shenandoah Valley'},{code:'434',label:'Charlottesville'}],
  WA:[{code:'206',label:'Seattle'},{code:'425',label:'Bellevue/Eastside'},{code:'253',label:'Tacoma'},{code:'360',label:'Western WA'},{code:'509',label:'Eastern WA/Spokane'}],
  WV:[{code:'304',label:'Statewide'},{code:'681',label:'Statewide'}],
  WI:[{code:'414',label:'Milwaukee'},{code:'262',label:'Southeast WI'},{code:'608',label:'Madison'},{code:'920',label:'Green Bay'},{code:'715',label:'Northern WI'}],
  WY:[{code:'307',label:'Statewide'}],
};

function getAreaCodeForState(stateCode) {
  const codes = STATE_AREA_CODES[(stateCode || '').toUpperCase().trim()];
  return codes ? codes[0].code : '561';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return res.status(500).json({ error: 'Twilio credentials not configured' });
  }

  try {
    const { farrierId, areaCode, state } = req.body;
    if (!farrierId) return res.status(400).json({ error: 'farrierId required' });

    // IDEMPOTENCY CHECK — one number per farrier, forever
    try {
      const db = getFirestore(getAdminApp());
      const doc = await db.collection('farriers').doc(farrierId).get();
      if (doc.exists) {
        const existing = doc.data()?.twilioPhoneNumber;
        if (existing) {
          console.log(`ℹ️ Farrier ${farrierId} already has number ${existing} — skipping provision`);
          return res.status(200).json({ success: true, phoneNumber: existing, alreadyProvisioned: true });
        }
      }
    } catch (checkErr) {
      console.warn('Could not check existing twilioPhoneNumber:', checkErr.message);
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // Resolve area code: explicit param > state-derived > default 561
    const searchAreaCode = areaCode || getAreaCodeForState(state) || '561';

    // Search for available local numbers
    const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${searchAreaCode}&SmsEnabled=true&MmsEnabled=false&Limit=1`;
    const searchRes = await fetch(searchUrl, { headers });
    const searchData = await searchRes.json();

    let phoneNumber;
    if (searchData.available_phone_numbers && searchData.available_phone_numbers.length > 0) {
      phoneNumber = searchData.available_phone_numbers[0].phone_number;
    } else {
      // Fallback — any US number
      const fallbackUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&Limit=1`;
      const fallbackRes = await fetch(fallbackUrl, { headers });
      const fallbackData = await fallbackRes.json();
      if (!fallbackData.available_phone_numbers?.length) {
        return res.status(500).json({ error: 'No available phone numbers found' });
      }
      phoneNumber = fallbackData.available_phone_numbers[0].phone_number;
    }

    // Purchase the number
    const purchaseRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      {
        method: 'POST',
        headers,
        body: new URLSearchParams({
          PhoneNumber: phoneNumber,
          SmsUrl: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.farritech.com'}/api/twilio-webhook`,
          SmsMethod: 'POST',
          FriendlyName: `FarriTech - ${farrierId}`,
        }).toString(),
      }
    );

    const purchaseData = await purchaseRes.json();
    if (purchaseData.error_code) {
      return res.status(400).json({ error: purchaseData.message });
    }

    // Add to Messaging Service
    await fetch(
      `https://api.twilio.com/2010-04-01/Services/${messagingServiceSid}/PhoneNumbers.json`,
      {
        method: 'POST',
        headers,
        body: new URLSearchParams({ PhoneNumberSid: purchaseData.sid }).toString(),
      }
    );

    return res.status(200).json({
      success: true,
      phoneNumber: purchaseData.phone_number,
      phoneNumberSid: purchaseData.sid,
    });

  } catch (err) {
    console.error('Provision error:', err);
    return res.status(500).json({ error: 'Failed to provision phone number' });
  }
}
