// Import our models. Loading each module registers the model into sequelize
// so any other part of the application could call sequelize.model('users')
// to get access to the User model.

import User from './user.ts';

export { User };
