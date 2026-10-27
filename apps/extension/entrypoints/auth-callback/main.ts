import { useTokenStore } from '../../src/store/tokens';

function handleCallback() {
  const hash = window.location.hash.substring(1);
  const search = window.location.search.substring(1);
  const params = new URLSearchParams(hash || search);

  const accessToken = params.get('access_token') || params.get('token');
  const refreshToken = params.get('refresh_token');
  const email = params.get('email');
  const userId = params.get('user_id');

  if (accessToken) {
    useTokenStore.getState().setTokens(
      accessToken,
      refreshToken || undefined,
      email || undefined,
      userId || undefined
    );

    // Notify user and close tab after brief pause
    setTimeout(() => {
      window.close();
    }, 600);
  } else {
    console.error('No access token found in authentication callback URL');
  }
}

handleCallback();
