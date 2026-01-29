// AppointmentFilters.js
// Add this component to your appointments screen

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from './firebase-config'; // Adjust path as needed

const AppointmentFilters = ({ onFilteredAppointments, farrierId }) => {
  const [activeFilter, setActiveFilter] = useState('all-pending');
  const [loading, setLoading] = useState(false);

  const getDateRanges = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfNextWeek = new Date(endOfWeek);
    startOfNextWeek.setDate(endOfWeek.getDate() + 1);
    startOfNextWeek.setHours(0, 0, 0, 0);

    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    endOfNextWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    return {
      thisWeek: { start: startOfWeek, end: endOfWeek },
      nextWeek: { start: startOfNextWeek, end: endOfNextWeek },
      thisMonth: { start: startOfMonth, end: endOfMonth },
      nextMonth: { start: startOfNextMonth, end: endOfNextMonth }
    };
  };

  const filterAppointments = async (filterType) => {
    setLoading(true);
    setActiveFilter(filterType);

    try {
      let q;
      const appointmentsRef = collection(db, 'appointments');
      const ranges = getDateRanges();

      switch (filterType) {
        case 'all-pending':
          q = query(
            appointmentsRef,
            where('status', '==', 'Pending'),
            where('farrierId', '==', farrierId)
          );
          break;

        case 'all-confirmed':
          q = query(
            appointmentsRef,
            where('status', '==', 'Confirmed'),
            where('farrierId', '==', farrierId)
          );
          break;

        case 'confirmed-this-week':
          q = query(
            appointmentsRef,
            where('status', '==', 'Confirmed'),
            where('farrierId', '==', farrierId)
          );
          break;

        case 'confirmed-next-week':
          q = query(
            appointmentsRef,
            where('status', '==', 'Confirmed'),
            where('farrierId', '==', farrierId)
          );
          break;

        case 'confirmed-this-month':
          q = query(
            appointmentsRef,
            where('status', '==', 'Confirmed'),
            where('farrierId', '==', farrierId)
          );
          break;

        case 'confirmed-next-month':
          q = query(
            appointmentsRef,
            where('status', '==', 'Confirmed'),
            where('farrierId', '==', farrierId)
          );
          break;

        default:
          q = query(appointmentsRef, where('farrierId', '==', farrierId));
      }

      const snapshot = await getDocs(q);
      let appointments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Client-side date filtering for week/month ranges
      if (filterType.includes('week') || filterType.includes('month')) {
        appointments = appointments.filter(apt => {
          const aptDate = new Date(apt.requestedDate);
          
          if (filterType === 'confirmed-this-week') {
            return aptDate >= ranges.thisWeek.start && aptDate <= ranges.thisWeek.end;
          } else if (filterType === 'confirmed-next-week') {
            return aptDate >= ranges.nextWeek.start && aptDate <= ranges.nextWeek.end;
          } else if (filterType === 'confirmed-this-month') {
            return aptDate >= ranges.thisMonth.start && aptDate <= ranges.thisMonth.end;
          } else if (filterType === 'confirmed-next-month') {
            return aptDate >= ranges.nextMonth.start && aptDate <= ranges.nextMonth.end;
          }
          return true;
        });
      }

      onFilteredAppointments(appointments);
    } catch (error) {
      console.error('Filter error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    filterAppointments('all-pending');
  }, []);

  const filters = [
    { id: 'all-pending', label: 'All Pending' },
    { id: 'all-confirmed', label: 'All Confirmed' },
    { id: 'confirmed-this-week', label: 'Confirmed This Week' },
    { id: 'confirmed-next-week', label: 'Confirmed Next Week' },
    { id: 'confirmed-this-month', label: 'Confirmed This Month' },
    { id: 'confirmed-next-month', label: 'Confirmed Next Month' }
  ];

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px',
      marginBottom: '20px',
      padding: '15px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px'
    }}>
      {filters.map(filter => (
        <button
          key={filter.id}
          onClick={() => filterAppointments(filter.id)}
          disabled={loading}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: activeFilter === filter.id ? 'bold' : 'normal',
            backgroundColor: activeFilter === filter.id ? '#4CAF50' : 'white',
            color: activeFilter === filter.id ? 'white' : '#333',
            border: '2px solid #4CAF50',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            opacity: loading ? 0.6 : 1
          }}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
};

export default AppointmentFilters;
