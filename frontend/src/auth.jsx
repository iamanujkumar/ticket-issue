import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { getMe, logout } from './api.js';
import { ErrorBox, Layout, Loading } from './components.jsx';
import { useRealtime } from './realtime.jsx';

export const ME_KEY = ['me'];

export const HOME_BY_ROLE = {
  AUTHOR: '/books',
  ADMIN: '/admin',
};

async function getMeOrNull() {
  try {
    const { user } = await getMe();
    return user;
  } catch (error) {
    if (error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: getMeOrNull, staleTime: Infinity });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => logout().catch(() => null),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      navigate('/login', { replace: true });
    },
  });
}

export function RequireRole({ role }) {
  const { data: user, isPending, error, refetch } = useMe();
  const logoutMutation = useLogout();
  useRealtime(user?.role === role);

  if (isPending) {
    return <Loading />;
  }
  if (error) {
    return <ErrorBox error={error} onRetry={refetch} />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== role) {
    return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  }

  return (
    <Layout user={user} onLogout={() => logoutMutation.mutate()} isLoggingOut={logoutMutation.isPending}>
      <Outlet />
    </Layout>
  );
}

export function HomeRedirect() {
  const { data: user, isPending, error, refetch } = useMe();

  if (isPending) {
    return <Loading />;
  }
  if (error) {
    return <ErrorBox error={error} onRetry={refetch} />;
  }
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />;
}
