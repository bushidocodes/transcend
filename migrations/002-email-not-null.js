// Issue #139: email must be present. Local signup previously allowed NULL email (Sequelize
// skips validators when the field is absent), and Postgres unique indexes treat NULLs as
// distinct, so unlimited emailless rows could pile up. Delete any such unusable rows, then
// enforce NOT NULL at the column.

module.exports = {
  async up ({ context: { queryInterface, Sequelize } }) {
    // Row deletion is irreversible (down cannot restore these), so log the count for operators.
    const [, meta] = await queryInterface.sequelize.query(
      "DELETE FROM users WHERE email IS NULL OR email = ''"
    );
    console.log(`002-email-not-null: deleted ${meta.rowCount || 0} row(s) with NULL/empty email`);
    await queryInterface.changeColumn('users', 'email', {
      type: Sequelize.STRING,
      allowNull: false
    });
  },

  async down ({ context: { queryInterface, Sequelize } }) {
    await queryInterface.changeColumn('users', 'email', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
