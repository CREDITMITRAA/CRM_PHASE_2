const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('UserMetrics', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    assigned_calls: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // Total calls assigned for the day
    calls_done: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    connected_calls: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    interested: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    walk_ins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW }, // Track per day
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' }
  }, { timestamps: true });
};
