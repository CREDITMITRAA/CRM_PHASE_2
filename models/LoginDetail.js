const { DataTypes } = require("sequelize");
const { LOGIN_STATUS_OPTIONS } = require("../utilities/constants");

module.exports = (sequelize) => {
  const LoginDetail = sequelize.define(
    "LoginDetail",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      lead_id: { type: DataTypes.INTEGER, allowNull:false },
      bank_name: { type: DataTypes.STRING, allowNull: false },
      application_number: { type: DataTypes.STRING, allowNull: false },
      login_date: { type: DataTypes.DATEONLY, allowNull: false },
      disbursal_date: { type: DataTypes.DATEONLY, allowNull: false },
      dsa_name: { type: DataTypes.STRING, allowNull: false },
      login_status: { type: DataTypes.ENUM(...LOGIN_STATUS_OPTIONS) },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        defaultValue: "active",
      },
      updated_by: { type: DataTypes.INTEGER },
      created_by: { type: DataTypes.INTEGER },
    },
    {
      timestamps: true,
      paranoid: true, // Optional: for soft deletion
    }
  );
  return LoginDetail;
};
