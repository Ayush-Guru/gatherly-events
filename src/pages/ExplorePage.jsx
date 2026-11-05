import { useMemo, useState } from 'react';
import { ArrowDown, Compass } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import EventCard from '../components/events/EventCard';
import EventFilters from '../components/events/EventFilters';
import EventDetailsModal from '../components/events/EventDetailsModal';
import RegistrationModal from '../components/registration/RegistrationModal';
import EmptyState from '../components/ui/EmptyState';

const defaultFilters = { search: '', category: 'All events', city: 'All cities', type: 'All formats', price: 'Any price', sort: 'soonest' };

export default function ExplorePage() {
  const { events, eventsLoading, eventsError, loadEvents } = useApp();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ ...defaultFilters, category: params.get('category') || 'All events' });
  const [selected, setSelected] = useState(null);
  const [registering, setRegistering] = useState(null);
  const filtered = useMemo(() => events.filter((event) => { const query = filters.search.toLowerCase(); const matchesSearch = !query || [event.title, event.city, event.venue, event.category, event.description].some((value) => value.toLowerCase().includes(query)); const matchesCategory = filters.category === 'All events' || event.category === filters.category; const matchesCity = filters.city === 'All cities' || event.city === filters.city; const matchesType = filters.type === 'All formats' || event.type === filters.type; const matchesPrice = filters.price === 'Any price' || (filters.price === 'Free' ? event.price === 0 : filters.price === 'Under ₹1,000' ? event.price < 1000 : event.price < 1500); return matchesSearch && matchesCategory && matchesCity && matchesType && matchesPrice; }).sort((a, b) => filters.sort === 'popular' ? b.attendees - a.attendees : filters.sort === 'price-low' ? a.price - b.price : filters.sort === 'price-high' ? b.price - a.price : new Date(a.date) - new Date(b.date)), [events, filters]);
  return <main className="mx-auto min-h-screen w-[min(1180px,calc(100%-32px))] py-12 sm:py-20"><div className="mb-10 max-w-2xl"><p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.2em] text-coral"><Compass size={15} /> The Gatherly calendar</p><h1 className="font-display text-5xl font-semibold leading-[.95] tracking-[-.09em] sm:text-7xl">Find a room<br />worth <span className="serif text-coral">entering.</span></h1><p className="mt-5 max-w-lg text-sm leading-7 text-ink/55 dark:text-cream/55">Browse the good stuff: workshops, parties, festivals, conversations, and the occasional very good excuse to get out of the house.</p></div><EventFilters filters={filters} setFilters={setFilters} resultCount={filtered.length} /><div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{eventsLoading ? <p role="status">Loading events…</p> : eventsError ? <p role="alert" className="text-sm text-red-500">{eventsError} <button onClick={loadEvents} className="font-bold underline">Retry</button></p> : filtered.length ? filtered.map((event) => <EventCard key={event.id} event={event} onDetails={setSelected} />) : <EmptyState />}</div><div className="mt-10 flex justify-center text-xs text-ink/40 dark:text-cream/40"><ArrowDown size={15} className="mr-2" /> New gatherings are added every week</div><EventDetailsModal event={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onRegister={(event) => { setSelected(null); setRegistering(event); }} /><RegistrationModal event={registering} open={Boolean(registering)} onClose={() => setRegistering(null)} /></main>;
}
