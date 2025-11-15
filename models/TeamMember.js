const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('TeamMember', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    team_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Teams',
        key: 'id'
      },
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users',
        key: 'id'
      },
      allowNull: false
    }
  }, { 
    timestamps: true,
    tableName: 'TeamMembers',
    indexes: [
      {
        unique: true,
        fields: ['team_id', 'user_id']
      }
    ]
  });
};