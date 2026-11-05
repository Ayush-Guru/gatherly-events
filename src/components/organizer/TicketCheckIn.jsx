import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

export default function TicketCheckIn() {
  const { updateRegistrationLocally, events } = useApp();
  const [eventId, setEventId] = useState('');
  const [value, setValue] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const videoRef = useRef(null);
  useEffect(() => {
    if (!camera) return undefined;
    let stream, stopped = false, frame;
    const start = async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) { setError('Camera QR scanning is unavailable here. Enter the ticket reference manually.'); setCamera(false); return; }
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        videoRef.current.srcObject = stream; await videoRef.current.play();
        const scan = async () => {
          if (stopped) return;
          try { const codes = await detector.detect(videoRef.current); const code = codes.find((item) => item.rawValue?.startsWith('gatherly:')); if (code) { setValue(code.rawValue); setCamera(false); return; } } catch { /* Keep scanning while the camera is starting. */ }
          frame = requestAnimationFrame(scan);
        };
        scan();
      } catch { setError('Could not access the camera. Check permissions or enter the ticket reference manually.'); setCamera(false); }
    };
    start();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [camera]);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setResult('');
    if (!eventId) { setError('Choose the event first.'); return; }
    const reference = value.trim().replace(/^gatherly:/i, '');
    if (!/^GTH-[A-Za-z0-9-]+$/.test(reference)) { setError('Enter a valid Gatherly ticket reference.'); return; }
    setBusy(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('check_in_ticket', { ticket_id: reference, p_event_id: eventId }).single();
      if (rpcError) throw rpcError;
      updateRegistrationLocally(data); setResult(`Checked in: ${data.name} · ${data.attendees} attendee(s).`); setValue('');
    } catch (err) { setError(err.message || 'Could not check in ticket.'); }
    finally { setBusy(false); }
  };
  return <section className="mt-12 rounded-3xl border border-ink/10 bg-white/60 p-5 dark:border-cream/10 dark:bg-cream/[.05]"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-coral">At the door</p><h2 className="mt-2 font-display text-2xl font-semibold">Ticket check-in</h2><p className="mt-2 text-xs leading-5 text-ink/55 dark:text-cream/55">Scan a Gatherly QR or enter its reference. Check-in is one-time for the entire booking, including all attendees. Camera scanning requires a supported browser and camera permission.</p><label className="mt-4 block text-xs font-bold">Check-in event<select value={eventId} onChange={(e) => setEventId(e.target.value)} className="mt-2 block w-full rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm dark:border-cream/10"><option value="">Select an event</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label><form onSubmit={submit} className="mt-4 flex flex-wrap gap-2"><label className="sr-only" htmlFor="ticket-reference">Ticket reference</label><input id="ticket-reference" value={value} onChange={(e) => setValue(e.target.value)} placeholder="GTH-… or gatherly:GTH-…" className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-transparent px-3 py-3 text-sm dark:border-cream/10" /><button disabled={busy} className="rounded-full bg-ink px-4 py-3 text-xs font-bold text-cream disabled:opacity-50 dark:bg-citrus dark:text-ink">{busy ? 'Checking…' : 'Check in'}</button><button type="button" onClick={() => { setError(''); setCamera((current) => !current); }} className="rounded-full border border-ink/20 px-4 py-3 text-xs font-bold dark:border-cream/20">{camera ? 'Stop camera' : 'Scan QR'}</button></form>{camera && <video ref={videoRef} muted playsInline className="mt-4 max-h-72 w-full rounded-2xl bg-ink object-contain" />}{error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}{result && <p role="status" className="mt-3 text-xs font-bold text-emerald-600">{result}</p>}</section>;
}
