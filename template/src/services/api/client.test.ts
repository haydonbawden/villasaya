import * as apiClient from './client';
import * as mockApi from './mockApi';

describe('api client', () => {
  const originalEnv = process.env.USE_MOCK_API;

  beforeEach(() => {
    process.env.API_URL = '';
    process.env.USE_MOCK_API = 'true';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.USE_MOCK_API = originalEnv;
  });

  it('delegates login to the mock API when enabled', async () => {
    const spy = jest.spyOn(mockApi, 'login').mockResolvedValue({
      profile: { email: 'a@b.com', fullName: 'Test User', id: '1', role: 'tenant' },
      token: 'token',
    });

    const session = await apiClient.login({ email: 'a@b.com', password: 'secret' });

    expect(spy).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret' });
    expect(session.token).toBe('token');
  });

  it('falls back to mock tasks when API URL is missing', async () => {
    const spy = jest.spyOn(mockApi, 'fetchTasks').mockResolvedValue([]);

    await apiClient.fetchTasks();

    expect(spy).toHaveBeenCalled();
  });
});
