import * as apiClient from './client';
import * as mockApi from './mockApi';
import { instance } from '@/services/instance';

jest.mock('@/services/instance', () => ({
  instance: jest.fn(),
  setAuthorizationToken: jest.fn(),
}));

describe('api client', () => {
  const originalEnv = process.env.USE_MOCK_API;

  beforeEach(() => {
    process.env.API_URL = '';
    process.env.USE_MOCK_API = 'true';
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.USE_MOCK_API = originalEnv;
  });

  describe('mock API', () => {
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

  describe('real API', () => {
    beforeEach(() => {
      process.env.USE_MOCK_API = 'false';
      process.env.API_URL = 'https://api.example.com';
    });

    it('calls real API for login with correct endpoint', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          profile: { email: 'test@example.com', fullName: 'Test User', id: '123', role: 'tenant' },
          token: 'real-token',
        }),
      };
      (instance as jest.Mock).mockResolvedValue(mockResponse);

      await apiClient.login({ email: 'test@example.com', password: 'password123' });

      expect(instance).toHaveBeenCalledWith('auth/login', {
        json: { email: 'test@example.com', password: 'password123' },
        method: 'post',
      });
    });

    it('calls real API for fetchTasks with villa ID in path', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue([]),
      };
      (instance as jest.Mock).mockResolvedValue(mockResponse);

      await apiClient.fetchTasks('villa-123');

      expect(instance).toHaveBeenCalledWith('villas/villa-123/tasks', undefined);
    });

    it('calls real API for fetchDashboard with correct endpoint', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          profile: { email: 'test@example.com', fullName: 'Test', id: '1', role: 'tenant' },
          tasks: [],
          villas: [],
        }),
      };
      (instance as jest.Mock).mockResolvedValue(mockResponse);

      await apiClient.fetchDashboard();

      expect(instance).toHaveBeenCalledWith('dashboard', undefined);
    });

    it('calls real API for fetchClaims with list endpoint', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue([]),
      };
      (instance as jest.Mock).mockResolvedValue(mockResponse);

      await apiClient.fetchClaims('villa-456');

      expect(instance).toHaveBeenCalledWith('villas/villa-456/claims', undefined);
    });

    it('calls real API for fetchLease with lease endpoint', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          contractFileUrl: 'https://example.com/lease.pdf',
          endDate: '2025-12-31',
          id: 'lease-1',
          rentAmount: 5000,
          rentDueDay: 1,
          startDate: '2024-01-01',
          villaId: 'villa-789',
        }),
      };
      (instance as jest.Mock).mockResolvedValue(mockResponse);

      await apiClient.fetchLease('villa-789');

      expect(instance).toHaveBeenCalledWith('villas/villa-789/lease', undefined);
    });
  });
});
