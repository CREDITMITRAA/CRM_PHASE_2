const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('LeadAssignment', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lead_id: { type: DataTypes.INTEGER, unique:true },
    assigned_by: { type: DataTypes.INTEGER },
    assigned_to: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  }, { timestamps: true });
};
