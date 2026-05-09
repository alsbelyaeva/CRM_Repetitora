import jwt from 'jsonwebtoken';

export function authHeader(user: { id: string; email: string; role: string; fullName?: string | null }) {
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName || undefined,
    },
    process.env.JWT_SECRET || 'test-only-secret',
    { expiresIn: '1h' }
  );

  return { Authorization: `Bearer ${token}` };
}
