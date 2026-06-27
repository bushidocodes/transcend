const { styleText } = require('node:util');
const Sequelize = require('sequelize');

// SQL query logging (replaces the `debug` dep): set DEBUG=sql (or DEBUG=*) to print
// each query Sequelize runs. Disabled otherwise, matching `debug('sql')`'s no-op behaviour.
const debugEnabled = (process.env.DEBUG || '')
  .split(/[,\s]+/)
  .some(ns => ns === 'sql' || ns === '*');
const sqlLogging = debugEnabled ? msg => console.error(`sql ${msg}`) : false;

const name = process.env.DATABASE_NAME || ('transcend' + (process.env.NODE_ENV === 'testing' ? '_test' : ''));
const defaultUrl = `postgres://localhost:5432/${name}`;

// When testing, prefer DATABASE_TEST_URL so a shell-exported DATABASE_URL
// (pointing at the live dev DB) can't accidentally wipe it via force-sync.
const url = (process.env.NODE_ENV === 'testing' ? process.env.DATABASE_TEST_URL : null)
  || process.env.DATABASE_URL
  || defaultUrl;
console.log(styleText('blue', `Opening database connection to ${url}`));

// Create the database instance
const db = module.exports = new Sequelize(url, {
  logging: sqlLogging, // export DEBUG=sql in the environment to get SQL queries
  define: {
    underscored: true,       // use snake_case rather than camelCase column names
    freezeTableName: true,   // don't change table names from the one specified
    timestamps: true         // automatically include timestamp columns
  }
});

// Pull in our models
require('./models');

// Sync the db, creating it if necessary
function sync (force = process.env.NODE_ENV === 'testing', retries = 0, maxRetries = 5) {
  return db.sync({ force })
    .then(ok => console.log(styleText('blue', `Synced models to db ${url}`)))
    .catch(fail => {
      // Don't do this auto-create nonsense in prod, or if we've retried too many times
      if (process.env.NODE_ENV === 'production' || retries > maxRetries) {
        console.error(styleText('red', `********** database error ***********`));
        console.error(styleText('red', `Couldn't connect to ${url}`));
        console.error();
        console.error(styleText('red', String(fail)));
        console.error(styleText('red', `*************************************`));
        return;
      }
      // Otherwise, do this autocreate nonsense
      console.log(styleText('blue', `${retries ? `[retry ${retries}]` : ''} Creating database ${name}...`));
      return new Promise((resolve, reject) =>
        require('child_process').exec(`createdb "${name}"`, resolve)
      ).then(() => sync(true, retries + 1));
    });
}

db.didSync = sync();
