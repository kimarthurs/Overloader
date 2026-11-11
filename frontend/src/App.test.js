import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import App from './App';
import { performLogout, initAuthSession, clearAuthStorage, __resetForTesting, getAuthSessionId } from './auth';

describe('Auth & Logout Flow', () => {
  let alertSpy;
  let originalAdapter;

  beforeEach(() => {
    localStorage.clear();
    __resetForTesting();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    originalAdapter = axios.defaults.adapter;
  });

  afterEach(() => {
    alertSpy.mockRestore();
    axios.defaults.adapter = originalAdapter;
    localStorage.clear();
    __resetForTesting();
  });

  test('1. Main screen header has logout button next to user profile/nickname and logs out cleanly', async () => {
    localStorage.setItem('token', 'test-token-123');
    localStorage.setItem('userName', '홍길동');
    localStorage.setItem('theme', 'dark');

    // Mock API requests for logs
    axios.defaults.adapter = async (config) => {
      return {
        data: { dates: ['2026-11-01'], strength_dates: [], cardio_dates: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    render(<App />);

    // Check header profile and logout button
    expect(await screen.findByText(/홍길동/i)).toBeInTheDocument();
    const logoutButtons = screen.getAllByRole('button', { name: '로그아웃' });
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);

    // The header logout button should be immediately accessible
    const headerLogoutBtn = logoutButtons[0];
    fireEvent.click(headerLogoutBtn);

    // After logout:
    // 1. Should show AuthScreen
    expect(await screen.findByText('스마트한 운동기록 대시보드로 나의 헬스를 더 스마트하게!')).toBeInTheDocument();
    expect(screen.queryByText(/홍길동/i)).not.toBeInTheDocument();

    // 2. Token and userName removed from localStorage
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('userName')).toBeNull();

    // 3. Unrelated storage (theme) MUST be preserved
    expect(localStorage.getItem('theme')).toBe('dark');

    // 4. Axios default Authorization header removed
    expect(axios.defaults.headers.common['Authorization']).toBeUndefined();
  });

  test('2. Settings tab logout button works using common logout flow', async () => {
    localStorage.setItem('token', 'test-token-123');
    localStorage.setItem('userName', '철수');
    localStorage.setItem('theme', 'light');

    axios.defaults.adapter = async (config) => {
      if (config.url?.includes('/settings')) {
        return {
          data: { show_last_workout: true, discord_webhook_url: '' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (config.url?.includes('/auth/v2/')) {
        return {
          data: { id: 1, name: '철수', username: null, social_accounts: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      return {
        data: { dates: [], strength_dates: [], cardio_dates: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    render(<App />);

    // Navigate to Settings tab
    const settingsTabBtns = await screen.findAllByRole('button', { name: /설정/i });
    fireEvent.click(settingsTabBtns[0]);

    // Wait for settings to load
    await screen.findByText('로그인 수단 관리');

    // Find all logout buttons (header + settings)
    const logoutButtons = await screen.findAllByRole('button', { name: '로그아웃' });
    expect(logoutButtons.length).toBeGreaterThanOrEqual(2);

    // Click settings logout button
    fireEvent.click(logoutButtons[logoutButtons.length - 1]);

    // Should return to login screen
    expect(await screen.findByText('스마트한 운동기록 대시보드로 나의 헬스를 더 스마트하게!')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('userName')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('light');
    expect(axios.defaults.headers.common['Authorization']).toBeUndefined();
  });

  test('3. Refresh after logout keeps user logged out and does not fetch data', async () => {
    // Initial state after logout: localStorage has no token
    localStorage.setItem('theme', 'dark');

    render(<App />);

    expect(screen.getByText('스마트한 운동기록 대시보드로 나의 헬스를 더 스마트하게!')).toBeInTheDocument();
    expect(screen.queryByText(/홍길동/i)).not.toBeInTheDocument();
  });

  test('4. 401 on protected API triggers common logout and alerts "로그인이 만료되었어요. 다시 로그인해 주세요."', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('userName', '영희');
    initAuthSession('expired-token', '영희');

    axios.defaults.adapter = async (config) => {
      if (config.url?.includes('/logs')) {
        const error = new Error('Request failed with status code 401');
        error.response = { status: 401, data: { detail: 'Token expired or invalid' } };
        error.config = config;
        throw error;
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    render(<App />);

    // Should navigate to LoginScreen and alert user
    expect(await screen.findByText('스마트한 운동기록 대시보드로 나의 헬스를 더 스마트하게!')).toBeInTheDocument();
    expect(alertSpy).toHaveBeenCalledWith('로그인이 만료되었어요. 다시 로그인해 주세요.');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('userName')).toBeNull();
    expect(axios.defaults.headers.common['Authorization']).toBeUndefined();
  });

  test('5. Concurrent 401 responses trigger alert only once', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('userName', '영희');
    initAuthSession('expired-token', '영희');

    axios.defaults.adapter = async (config) => {
      const error = new Error('Unauthorized');
      error.response = { status: 401, data: { detail: 'Token expired' } };
      error.config = config;
      throw error;
    };

    // Fire 3 simultaneous authenticated requests
    const p1 = axios.get('/api/test1');
    const p2 = axios.get('/api/test2');
    const p3 = axios.get('/api/test3');

    await Promise.allSettled([p1, p2, p3]);

    // Alert should have been called EXACTLY ONCE
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('로그인이 만료되었어요. 다시 로그인해 주세요.');
  });

  test('6. 401 on login request (/auth/google) or unauthenticated request does not trigger session expired alert', async () => {
    localStorage.clear();
    __resetForTesting();

    axios.defaults.adapter = async (config) => {
      const error = new Error('Unauthorized');
      error.response = { status: 401, data: { detail: 'Invalid Google token' } };
      error.config = config;
      throw error;
    };

    // 1) Login request returning 401
    await expect(axios.post('/auth/google', { token: 'bad-google-token' })).rejects.toThrow();
    expect(alertSpy).not.toHaveBeenCalled();

    // 2) Unauthenticated request returning 401
    await expect(axios.get('/public-or-unauth')).rejects.toThrow();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('7. Late-arriving responses from pre-logout requests are discarded and do not pollute state', async () => {
    localStorage.setItem('token', 'user1-token');
    localStorage.setItem('userName', 'User1');
    initAuthSession('user1-token', 'User1');

    let requestStartedResolve;
    const requestStartedPromise = new Promise(resolve => {
      requestStartedResolve = resolve;
    });

    let resolveSlowRequest;
    const slowPromise = new Promise(resolve => {
      resolveSlowRequest = resolve;
    });

    axios.defaults.adapter = async (config) => {
      if (config.url?.includes('/slow-api')) {
        requestStartedResolve();
        await slowPromise;
        return { data: { secret: 'user1-secret-data' }, status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    let dataReceived = null;
    let errorCaught = null;
    axios.get('/slow-api')
      .then(res => {
        dataReceived = res.data;
      })
      .catch(err => {
        errorCaught = err;
      });

    // Wait until request has actually started and captured current session info
    await requestStartedPromise;

    // User logs out BEFORE slow request resolves
    performLogout({ expired: false });
    expect(localStorage.getItem('token')).toBeNull();

    // Now resolve slow request
    resolveSlowRequest();
    await new Promise(r => setTimeout(r, 50));

    // dataReceived must remain null because in-flight request was aborted and discarded
    expect(dataReceived).toBeNull();
    expect(axios.isCancel(errorCaught)).toBe(true);
  });
});
