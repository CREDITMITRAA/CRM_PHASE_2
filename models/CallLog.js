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

    // store duration in seconds instead of "9 seconds"
    call_duration: { 
      type: DataTypes.INTEGER, 
      allowNull: true,
      comment: 'Duration in seconds'
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
      comment: 'Duration in seconds'
    },

    total_duration: { 
      type: DataTypes.INTEGER, 
      allowNull: true,
      comment: 'Duration in seconds'
    },

    status: { 
      type: DataTypes.ENUM('active', 'inactive'), 
      defaultValue: 'active' 
    }

  }, { 
    timestamps: true,
  });
};
