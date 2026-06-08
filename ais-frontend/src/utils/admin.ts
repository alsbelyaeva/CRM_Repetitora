export interface AppUser {
  id: string;
  email: string;
  emailVerifiedAt?: string | null;
  emailVerified?: boolean;
  fullName?: string;
  address?: string | null;
  telegramChatId?: string | null;
  role: 'ADMIN' | 'TEACHER';
}

export const getUserLabel = (user: AppUser) => {
  return user.fullName || user.email;
};

export const getTeacherOptions = (users: AppUser[]) => {
  return users.filter(user => user.role === 'TEACHER');
};
