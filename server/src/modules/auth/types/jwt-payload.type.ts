export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  email: string;
}
