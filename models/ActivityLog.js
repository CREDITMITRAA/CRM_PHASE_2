const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('ActivityLog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    created_by: { type: DataTypes.INTEGER, allowNull: false },
    activity_desc: { type: DataTypes.TEXT, allowNull: false },
    lead_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('active', 'deleted'), defaultValue: 'active', allowNull: false },
  }, { timestamps: true });
};
