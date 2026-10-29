import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from './api.js';
import { HomeRedirect, ME_KEY, RequireRole } from './auth.jsx';
import { NotFound, RouteError } from './components.jsx';
import './index.css';
import { AdminTicketPage } from './pages/AdminTicketPage.jsx';
import { AuthorTicketPage } from './pages/AuthorTicketPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { MyBooksPage } from './pages/MyBooksPage.jsx';
import { MyTicketsPage } from './pages/MyTicketsPage.jsx';
import { NewTicketPage } from './pages/NewTicketPage.jsx';
import { QueuePage } from './pages/QueuePage.jsx';

function handleApiError(error) {
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(ME_KEY, null);
  }
}

function retryOnlyServerErrors(failureCount, error) {
  const isClientError = error instanceof ApiError && error.status < 500;
  return !isClientError && failureCount < 1;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: retryOnlyServerErrors },
  },
});

const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <HomeRedirect /> },
      {
        element: <RequireRole role="AUTHOR" />,
        children: [
          { path: '/books', element: <MyBooksPage /> },
          { path: '/tickets', element: <MyTicketsPage /> },
          { path: '/tickets/new', element: <NewTicketPage /> },
          { path: '/tickets/:ticketId', element: <AuthorTicketPage /> },
        ],
      },
      {
        element: <RequireRole role="ADMIN" />,
        children: [
          { path: '/admin', element: <QueuePage /> },
          { path: '/admin/tickets/:ticketId', element: <AdminTicketPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
