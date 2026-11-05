import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initialEvents } from '../data/events';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);

function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function normalizeEvent(row) { return { ...row, endDate: row.endDate || row.end_date, longDescription: row.longDescription || row.long_description, gallery: row.gallery || [row.image], speakers: row.speakers || [], tags: row.tags || [] }; }

export function AppProvider({ children }) {
  const { user } = useAuth();
  const [events, setEvents] = useState(() => read('gatherly-events', initialEvents));
  const [savedIds, setSavedIds] = useState(() => read('gatherly-saved', []));
  const [registrations, setRegistrations] = useState(() => read('gatherly-registrations', []));
  const [language, setLanguage] = useState(() => localStorage.getItem('gatherly-language') || 'en');

  useEffect(() => {
    if (!supabase) return;
    supabase.from('events').select('*').order('date').then(({ data }) => { if (data?.length) setEvents(data.map(normalizeEvent)); });
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;
    Promise.all([
      supabase.from('saved_events').select('event_id').eq('user_id', user.id),
      supabase.from('registrations').select('*, events(title, city, date)').order('created_at', { ascending: false }),
    ]).then(([saved, booked]) => {
      if (saved.data) setSavedIds(saved.data.map((item) => item.event_id));
      if (booked.data) setRegistrations(booked.data.map((item) => ({ ...item, eventId: item.event_id, eventTitle: item.events?.title || item.eventTitle, createdAt: item.created_at, paymentStatus: item.payment_status, transactionId: item.transaction_id }))); 
    });
  }, [user]);

  const toggleSaved = async (eventId) => {
    const wasSaved = savedIds.includes(eventId);
    const next = wasSaved ? savedIds.filter((id) => id !== eventId) : [...savedIds, eventId];
    setSavedIds(next); write('gatherly-saved', next);
    if (supabase && user) {
      if (wasSaved) await supabase.from('saved_events').delete().match({ user_id: user.id, event_id: eventId });
      else await supabase.from('saved_events').insert({ user_id: user.id, event_id: eventId });
    }
  };

  const register = async (details) => {
    const duplicate = registrations.find((item) => item.email.toLowerCase() === details.email.toLowerCase() && item.eventId === details.eventId);
    if (duplicate) return { error: 'You are already registered for this event with this email.' };
    const event = events.find((item) => item.id === details.eventId);
    const registration = { ...details, id: `GTH-${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Date.now().toString().slice(-4)}`, eventTitle: event?.title || 'Gatherly event', createdAt: new Date().toISOString(), status: 'Pending', paymentStatus: 'manual_pending' };
    if (supabase) {
      if (!user) return { error: 'Sign in before registering for an event.' };
      const { data, error } = await supabase.from('registrations').insert({ id: registration.id, user_id: user.id, event_id: details.eventId, name: details.name, email: details.email, phone: details.phone, attendees: Number(details.attendees || 1), ticket: details.ticket, total: Number(details.total || 0), transaction_id: details.transactionId, status: 'Pending', payment_status: 'manual_pending' }).select().single();
      if (error) return { error: error.code === '23505' ? 'You are already registered for this event.' : error.message };
      if (data) Object.assign(registration, { ...data, eventId: data.event_id, eventTitle: event?.title || 'Gatherly event', createdAt: data.created_at, transactionId: data.transaction_id, paymentStatus: data.payment_status });
    }
    const nextRegistrations = [registration, ...registrations];
    setRegistrations(nextRegistrations); write('gatherly-registrations', nextRegistrations);
    return { registration };
  };

  const approveRegistration = async (id) => {
    const registration = registrations.find((item) => item.id === id);
    if (!registration || registration.status === 'Confirmed') return;
    if (supabase && user) await supabase.from('registrations').update({ status: 'Confirmed', payment_status: 'paid' }).eq('id', id);
    const nextRegistrations = registrations.map((item) => item.id === id ? { ...item, status: 'Confirmed', paymentStatus: 'paid', payment_status: 'paid' } : item);
    setRegistrations(nextRegistrations); write('gatherly-registrations', nextRegistrations);
    setEvents((current) => { const nextEvents = current.map((item) => item.id === registration.eventId ? { ...item, attendees: item.attendees + Number(registration.attendees || 1) } : item); write('gatherly-events', nextEvents); return nextEvents; });
    return registration;
  };

  const rejectRegistration = async (id) => {
    const registration = registrations.find((item) => item.id === id);
    if (!registration) return;
    if (supabase && user) await supabase.from('registrations').update({ status: 'Rejected', payment_status: 'rejected' }).eq('id', id);
    const nextRegistrations = registrations.map((item) => item.id === id ? { ...item, status: 'Rejected', paymentStatus: 'rejected', payment_status: 'rejected' } : item);
    setRegistrations(nextRegistrations); write('gatherly-registrations', nextRegistrations);
    return registration;
  };

  const cancelRegistration = async (id) => {
    const registration = registrations.find((item) => item.id === id);
    if (supabase && user) await supabase.from('registrations').update({ status: 'Cancelled' }).eq('id', id).eq('user_id', user.id);
    const next = registrations.filter((item) => item.id !== id); setRegistrations(next); write('gatherly-registrations', next);
    if (registration?.status === 'Confirmed') setEvents((current) => { const nextEvents = current.map((item) => item.id === registration.eventId ? { ...item, attendees: Math.max(0, item.attendees - Number(registration.attendees || 1)) } : item); write('gatherly-events', nextEvents); return nextEvents; });
  };

  const saveEvents = (nextEvents) => { setEvents(nextEvents); write('gatherly-events', nextEvents); };
  const addEvent = async (event) => {
    const nextEvent = { ...event, id: `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now()}`, attendees: 0, capacity: Number(event.capacity || 200), rating: 5, featured: false, tags: ['New event'], gallery: [event.image] };
    if (supabase && user) await supabase.from('events').insert({ ...nextEvent, end_date: nextEvent.endDate, long_description: nextEvent.longDescription, organizer_id: user.id });
    saveEvents([nextEvent, ...events]);
  };
  const updateEvent = async (updated) => { if (supabase && user) await supabase.from('events').update({ ...updated, end_date: updated.endDate, long_description: updated.longDescription }).eq('id', updated.id); saveEvents(events.map((event) => event.id === updated.id ? updated : event)); };
  const deleteEvent = async (id) => { if (supabase && user) await supabase.from('events').delete().eq('id', id); saveEvents(events.filter((event) => event.id !== id)); };
  const switchLanguage = () => { const next = language === 'en' ? 'hi' : 'en'; setLanguage(next); localStorage.setItem('gatherly-language', next); };

  const value = useMemo(() => ({ events, savedIds, registrations, language, toggleSaved, register, approveRegistration, rejectRegistration, cancelRegistration, addEvent, updateEvent, deleteEvent, switchLanguage }), [events, savedIds, registrations, language, user]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
