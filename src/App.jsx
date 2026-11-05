import { Route, Routes } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import HomePage from './pages/HomePage';
import ExplorePage from './pages/ExplorePage';
import EventPage from './pages/EventPage';
import DashboardPage from './pages/DashboardPage';
import OrganizerPage from './pages/OrganizerPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return <div className="min-h-screen bg-cream text-ink transition-colors dark:bg-ink dark:text-cream"><Navbar /><Routes><Route path="/" element={<HomePage />} /><Route path="/explore" element={<ExplorePage />} /><Route path="/events/:id" element={<EventPage />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="/organizer" element={<OrganizerPage />} /><Route path="*" element={<NotFoundPage />} /></Routes><Footer /></div>;
}
