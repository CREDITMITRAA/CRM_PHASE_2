const { DataTypes } = require('sequelize');
const { WALK_IN_STATUSES, TASK_STATUSES } = require('../utilities/constants');

module.exports = (sequelize) => {
  return sequelize.define('WalkIn', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    lead_id: { 
      type: DataTypes.INTEGER 
    },
    walk_in_status: { 
      type: DataTypes.ENUM(...WALK_IN_STATUSES),
      defaultValue: "Upcoming"
    },
    walk_in_date_time: { 
      type: DataTypes.DATE 
    },
    is_rescheduled: { 
      type: DataTypes.BOOLEAN, 
      defaultValue: false 
    },
    rescheduled_date_time: { 
      type: DataTypes.DATE 
    },
    note: { 
      type: DataTypes.TEXT 
    },
    created_by: { 
      type: DataTypes.INTEGER 
    },
    is_call: { 
      type: DataTypes.BOOLEAN, 
      defaultValue: false 
    },
    status: { 
      type: DataTypes.ENUM('active', 'inactive'), 
      defaultValue: 'active' 
    },
  }, { timestamps: true });
};
