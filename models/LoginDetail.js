const { DataTypes } = require("sequelize");
const { LOGIN_STATUS_OPTIONS, LOGIN_SCHEME_OPTIONS } = require("../utilities/constants");

module.exports = (sequelize) => {
  const LoginDetail = sequelize.define(
    "LoginDetail",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      lead_id: { type: DataTypes.INTEGER, allowNull:false },
      bank_name: { type: DataTypes.STRING, allowNull: false },
      dsa_name: { type: DataTypes.STRING },
      application_number: { type: DataTypes.STRING },
      login_date: { type: DataTypes.DATEONLY },
      scheme: { type: DataTypes.ENUM(...LOGIN_SCHEME_OPTIONS) },
      login_amount: { type: DataTypes.INTEGER, allowNull: false },
      login_status: { type: DataTypes.ENUM(...LOGIN_STATUS_OPTIONS), allowNull: false },
      sanction_date: { type: DataTypes.DATEONLY },
      sanction_amount: { type: DataTypes.INTEGER },
      disbursal_date: { type: DataTypes.DATEONLY },
      disbursal_amount: { type: DataTypes.INTEGER },
      note: {type:DataTypes.TEXT},
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
