const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('CallLog', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },

    my_number: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },

    other_number: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },

    call_duration: { 
      type: DataTypes.INTEGER, 
      allowNull: true,
      comment: 'Duration in seconds',
      set(value) {
        if (typeof value === 'string') {
          this.setDataValue('call_duration', parseInt(value));
        } else {
          this.setDataValue('call_duration', value);
        }
      }
    },

    call_type: { 
      type: DataTypes.ENUM('INCOMING', 'OUTGOING', 'MISSED'), 
      allowNull: false 
    },

    call_status: { 
      type: DataTypes.ENUM('ANSWERED', 'NOT_ANSWERED', 'REJECTED', 'FAILED'), 
      allowNull: false 
    },

    call_timestamp: { 
      type: DataTypes.DATE, 
      allowNull: false 
    },

    ringing_duration: { 
      type: DataTypes.INTEGER, 
      allowNull: true,
      comment: 'Duration in seconds',
      set(value) {
        if (typeof value === 'string') {
          this.setDataValue('ringing_duration', parseInt(value));
        } else {
          this.setDataValue('ringing_duration', value);
        }
      }
    },

    total_duration: { 
      type: DataTypes.INTEGER, 
      allowNull: true,
      comment: 'Duration in seconds',
      set(value) {
        if (typeof value === 'string') {
          this.setDataValue('total_duration', parseInt(value));
        } else {
          this.setDataValue('total_duration', value);
        }
      }
    },

    status: { 
      type: DataTypes.ENUM('active', 'inactive'), 
      defaultValue: 'active' 
    },

    contact_name: {   // added from JSON
      type: DataTypes.STRING, 
      allowNull: true 
    },

    call_log_id: {    // added from JSON
      type: DataTypes.INTEGER, 
      allowNull: true 
    },

    call_date: { // added from JSON
      type: DataTypes.DATE, 
      allowNull: false 
    },

    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    recording_file_url: {
      type: DataTypes.STRING,
      allowNull: true
    }

  }, { 
    timestamps: true,
  });
};
