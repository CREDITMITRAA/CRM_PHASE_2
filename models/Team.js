const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Team', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    name: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    created_by: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users',
        key: 'id'
      },
      allowNull: false
    },
    team_owner_id: { type: DataTypes.INTEGER,  allowNull: false},
    status: { 
      type: DataTypes.ENUM('active', 'inactive'), 
      defaultValue: 'active' 
    }
  }, { 
    timestamps: true,
    tableName: 'Teams'
  });
};