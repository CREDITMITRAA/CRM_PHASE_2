const { DataTypes } = require("sequelize");
const { LEAD_AGGREGATOR, CONNECTOR } = require("../utilities/constants");

module.exports = (sequelize) => {
  const LeadPartner = sequelize.define("LeadPartner", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    partner_code: {type: DataTypes.STRING, allowNull:false, unique:true},
    name: { type: DataTypes.STRING },
    poc_name: { type: DataTypes.STRING, allowNull: false },
    poc_mobile: { type: DataTypes.STRING, allowNull: false },
    poc_email: { type: DataTypes.STRING, allowNull: false },
    lead_partner_type: {
      type: DataTypes.ENUM(LEAD_AGGREGATOR, CONNECTOR),
      defaultValue: LEAD_AGGREGATOR,
      allowNull: false,
    },
    api_key: { type: DataTypes.STRING, allowNull: false, unique:true },
    api_secret: { type: DataTypes.STRING, allowNull: false },
    password: {type: DataTypes.STRING, allowNull:false},
    is_active: { type: DataTypes.BOOLEAN, defaultValue: false },
    allowed_ips: {type:DataTypes.JSON, defaultValue:[]},
    allowed_domains: {type:DataTypes.JSON, defaultValue:[]},
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },
  });
  return LeadPartner;
};
