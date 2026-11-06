import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initialEvents } from '../data/events';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function normalizeEvent(row) { return { ...row, endDate: row.endDate || row.end_date, longDescription: row.longDescription || row.long_description, gallery: row.gallery || [row.image], speakers: row.speakers || [], tags: row.tags || [] }; }
function normalizeRegistration(item) { return { ...item, eventId: item.event_id, eventTitle: item.events?.title || item.eventTitle, createdAt: item.created_at, paymentStatus: item.payment_status, transactionId: item.transaction_id }; }
function eventPayload(event) {
  return { title: event.title, category: event.category, date: new Date(event.date).toISOString(), end_date: event.endDate ? new Date(event.endDate).toISOString() : null, venue: event.venue, city: event.city, type: event.type, price: Number(event.price), capacity: Number(event.capacity), image: event.image, description: event.description, long_description: event.longDescription || event.description, agenda: event.agenda || [], speakers: event.speakers || [], tags: event.tags || [], gallery: event.gallery || [event.image] };
}

export function AppProvider({ children }) {
  const { user, isOrganizer } = useAuth();
  const [events, setEvents] = useState(() => supabase ? [] : initialEvents);
  const [savedIds, setSavedIds] = useState(() => supabase ? [] : read('gatherly-saved', []));
  const [registrations, setRegistrations] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(Boolean(supabase));
  const [eventsError, setEventsError] = useState('');
  const [registrationsError, setRegistrationsError] = useState('');
  const [reviews, setReviews] = useState({});
  const [language, setLanguage] = useState(() => localStorage.getItem('gatherly-language') || 'en');
  const loadEvents = async () => {
    if (!supabase) return;
    setEventsLoading(true); setEventsError('');
    try {
      const { data, error } = await supabase.from('events').select('*').order('date');
      if (error) throw error;
      setEvents((data || []).map(normalizeEvent));
    } catch { setEventsError('Could not load events. Check your connection and try again.'); }
    finally { setEventsLoading(false); }
  };
  useEffect(() => { loadEvents(); }, []);
  useEffect(() => {
    if (!supabase || !user) { setRegistrations([]); setReviews({}); setRegistrationsError(''); if (supabase) setSavedIds([]); return undefined; }
    let active = true;
    setRegistrations([]); setSavedIds([]); setReviews({}); setRegistrationsError('');
    Promise.all([
      supabase.from('saved_events').select('event_id').eq('user_id', user.id),
      supabase.from('registrations').select('*, events(title, city, date)').order('created_at', { ascending: false }),
      supabase.from('reviews').select('event_id, rating').eq('user_id', user.id),
    ]).then(([saved, booked, rated]) => {
      if (!active) return;
      if (saved.data) setSavedIds(saved.data.map((item) => item.event_id));
      if (booked.data) setRegistrations(booked.data.map(normalizeRegistration));
      if (booked.error || rated.error) setRegistrationsError('Could not load all registrations or ratings. Please refresh.');
      if (rated.data) setReviews(Object.fromEntries(rated.data.map((item) => [item.event_id, item.rating])));
    }).catch(() => { if (active) setRegistrationsError('Could not load your account data. Please refresh.'); });
    return () => { active = false; };
  }, [user?.id]);
  const toggleSaved = async (eventId) => {
    const wasSaved = savedIds.includes(eventId);
    const next = wasSaved ? savedIds.filter((id) => id !== eventId) : [...savedIds, eventId];
    setSavedIds(next);
    if (supabase && user) {
      const { error } = wasSaved ? await supabase.from('saved_events').delete().match({ user_id: user.id, event_id: eventId }) : await supabase.from('saved_events').insert({ user_id: user.id, event_id: eventId });
      if (error) { setSavedIds(savedIds); return; }
    } else if (!supabase) write('gatherly-saved', next);
  };
  const register = async (details) => {
    if (!supabase || !user) return { error: 'Sign in before registering for an event.' };
    const event = events.find((item) => item.id === details.eventId);
    const { data, error } = await supabase.rpc('create_booking_hold', { p_event_id: details.eventId, p_name: details.name, p_email: details.email, p_phone: details.phone, p_attendees: Number(details.attendees), p_ticket: details.ticket }).single();
    if (error) return { error: error.message };
    const registration = { ...normalizeRegistration(data), eventTitle: event?.title || 'Gatherly event' };
    setRegistrations((current) => [registration, ...current.filter((item) => item.id !== registration.id)]);
    return { registration };
  };
  const submitPaymentReference = async (id, transactionId) => {
    if (!supabase || !user) throw new Error('Sign in before submitting a payment reference.');
    const { data, error } = await supabase.rpc('submit_upi_reference', { p_registration_id: id, p_utr: transactionId }).single();
    if (error) throw new Error(error.message);
    const eventTitle = events.find((item) => item.id === data.event_id)?.title || 'Gatherly event';
    const registration = { ...normalizeRegistration(data), eventTitle };
    setRegistrations((current) => [registration, ...current.filter((item) => item.id !== id)]);
    return registration;
  };
  const reviewRegistration = async (id, status, paymentStatus) => {
    if (!supabase || !user || !isOrganizer) throw new Error('Organizer access required.');
    const { data, error } = await supabase.from('registrations').update({ status, payment_status: paymentStatus }).eq('id', id).eq('status', 'Pending').select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('This request is no longer pending. Refresh and try again.');
    setRegistrations((current) => current.map((item) => item.id === id ? { ...item, status, paymentStatus, payment_status: paymentStatus } : item));
    if (status === 'Confirmed') setEvents((current) => current.map((event) => event.id === data.event_id ? { ...event, attendees: event.attendees + data.attendees } : event));
    return data;
  };
  const approveRegistration = (id) => reviewRegistration(id, 'Confirmed', 'paid');
  const rejectRegistration = (id) => reviewRegistration(id, 'Rejected', 'rejected');
  const cancelRegistration = async (id) => {
    if (!supabase || !user) throw new Error('Sign in to cancel your registration.');
    const registration = registrations.find((item) => item.id === id);
    const { data, error } = await supabase.from('registrations').update({ status: 'Cancelled' }).eq('id', id).eq('user_id', user.id).in('status', ['Pending', 'Confirmed']).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Unable to cancel this registration. Refresh and try again.');
    setRegistrations((current) => current.map((item) => item.id === id ? { ...item, ...normalizeRegistration(data), eventTitle: item.eventTitle } : item));
    if (registration?.status === 'Confirmed') setEvents((current) => current.map((event) => event.id === registration.eventId ? { ...event, attendees: Math.max(0, event.attendees - Number(registration.attendees)) } : event));
  };
  const rateEvent = async (eventId, rating) => {
    if (!supabase || !user) throw new Error('Sign in to rate an event.');
    const { error } = await supabase.from('reviews').upsert({ user_id: user.id, event_id: eventId, rating }, { onConflict: 'user_id,event_id' });
    if (error) throw new Error(error.message);
    setReviews((current) => ({ ...current, [eventId]: rating }));
    await loadEvents();
  };
  const markNotificationSent = (id, column) => setRegistrations((current) => current.map((item) => item.id === id ? { ...item, [column]: new Date().toISOString() } : item));
  const updateRegistrationLocally = (data) => setRegistrations((current) => current.map((item) => item.id === data.id ? { ...item, ...normalizeRegistration(data), eventTitle: item.eventTitle } : item));
  const addEvent = async (event) => {
    if (!supabase || !user || !isOrganizer) throw new Error('Organizer access required.');
    const id = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now()}`;
    const { data, error } = await supabase.from('events').insert({ ...eventPayload(event), id, organizer_id: user.id }).select().single();
    if (error) throw new Error(error.message);
    setEvents((current) => [normalizeEvent(data), ...current]);
  };
  const updateEvent = async (event) => {
    if (!supabase || !user || !isOrganizer) throw new Error('Organizer access required.');
    const { data, error } = await supabase.from('events').update(eventPayload(event)).eq('id', event.id).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Event could not be updated.');
    setEvents((current) => current.map((item) => item.id === event.id ? normalizeEvent(data) : item));
  };
  const deleteEvent = async (id) => {
    if (!supabase || !user || !isOrganizer) throw new Error('Organizer access required.');
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Event could not be deleted.');
    setEvents((current) => current.filter((item) => item.id !== id));
  };
  const switchLanguage = () => { const next = language === 'en' ? 'hi' : 'en'; setLanguage(next); localStorage.setItem('gatherly-language', next); };
  const value = useMemo(() => ({ events, eventsLoading, eventsError, loadEvents, registrationsError, savedIds, registrations, reviews, rateEvent, updateRegistrationLocally, markNotificationSent, language, toggleSaved, register, submitPaymentReference, approveRegistration, rejectRegistration, cancelRegistration, addEvent, updateEvent, deleteEvent, switchLanguage }), [events, eventsLoading, eventsError, registrationsError, savedIds, registrations, reviews, language, user, isOrganizer]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export const useApp = () => useContext(AppContext);
