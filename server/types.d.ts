// Passport puts the deserialized Sequelize user row on req.user; teach Express's type of
// `user` that shape so req.user.update()/req.user.id typecheck across the server.
import type { User as UserModel } from '../db/models/user.ts';

declare global {
  namespace Express {
    interface User extends UserModel {}
  }
}

export {};
