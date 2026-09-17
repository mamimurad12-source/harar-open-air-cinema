import { useEffect } from 'react';
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { EventPage } from './pages/EventPage';
import { BookPage } from './pages/BookPage';
import { PayReturnPage } from './pages/PayReturnPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { EventsPage } from './pages/admin/EventsPage';
import { BookingsPage } from './pages/admin/BookingsPage';
import { PaymentsPage } from './pages/admin/PaymentsPage';
import { TicketsPage } from './pages/admin/TicketsPage';
import { SettingsPage } from './pages/admin/SettingsPage';

/** Restores scroll position on route change; honors in-page anchors. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

function PublicShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <main className="grid flex-1 place-items-center bg-cream-100 px-4 py-24 text-center">
      <div>
        <p className="font-display text-7xl font-black text-wine-700">404</p>
        <h1 className="mt-3 font-display text-2xl font-black">This reel is missing.</h1>
        <p className="mt-2 text-sm font-semibold text-ink-500">
          The page you are looking for doesn't exist — yet.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-ink-950 px-7 py-3 text-sm font-extrabold text-cream-50"
        >
          ← Back to the show
        </Link>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Routes>
        <Route element={<PublicShell />}>
          <Route index element={<HomePage />} />
          <Route path="event" element={<EventPage />} />
          <Route path="book" element={<BookPage />} />
          <Route path="pay/return" element={<PayReturnPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<AdminLoginPage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
