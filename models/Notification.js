const { DataTypes } = require('sequelize');
const { LEAD_STATUSES, VERIFICATION_STATUSES, TASK_STATUSES } = require('../utilities/constants');

module.exports = (sequelize) => {
  return sequelize.define('Notification', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    employee_id: {type: DataTypes.INTEGER, allowNull:false},
    message: {type: DataTypes.TEXT, allowNull:false},
    is_read: {type: DataTypes.BOOLEAN, defaultValue:false},
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  }, { timestamps: true});
};