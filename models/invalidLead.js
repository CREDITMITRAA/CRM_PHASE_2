const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('InvalidLead', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true},
    phone: { type: DataTypes.STRING(50) },
    address: { type: DataTypes.TEXT },
    lead_source: { type: DataTypes.STRING },
    reason: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('active', 'deactive'), defaultValue: 'active' },
  }, { timestamps: true });
};