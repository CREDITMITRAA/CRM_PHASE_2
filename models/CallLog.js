const { DataTypes } = require('sequelize');
const { LEAD_STATUSES, VERIFICATION_STATUSES, TASK_STATUSES } = require('../utilities/constants');

module.exports = (sequelize) => {
  return sequelize.define('CallLog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    phone_number: {type: DataTypes.STRING, allowNull:false},
    call_type: {type: DataTypes.STRING, allowNull:false},
    employee_id: {type: DataTypes.STRING, allowNull:false},
    employee_name: {type: DataTypes.STRING, allowNull:false},
    duration: {type:DataTypes.BIGINT},
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  }, { timestamps: true});
};