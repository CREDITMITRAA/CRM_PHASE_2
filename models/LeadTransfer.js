const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('LeadTransfer', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lead_id: { type: DataTypes.INTEGER },
    transfered_from: { type: DataTypes.INTEGER },
    transfered_to: { type: DataTypes.INTEGER },
    transfered_by: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  }, { timestamps: true});
};
