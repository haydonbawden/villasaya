import ky from 'ky';

const prefixUrl = process.env.API_URL?.replace(/\/$/, '') ?? '';

let authorizationToken: string | undefined;

export const setAuthorizationToken = (token: string | undefined) => {
  authorizationToken = token;
};

export const instance = ky.extend({
  hooks: {
    beforeRequest: [
      (request) => {
        request.headers.set('Accept', 'application/json');

        if (authorizationToken) {
          request.headers.set('Authorization', `Bearer ${authorizationToken}`);
        }
      },
    ],
  },
  prefixUrl,
  retry: 1,
  timeout: 10_000,
});
