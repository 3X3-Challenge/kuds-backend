export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  uid: string;
  username: string;
  displayName: string | null;
}
