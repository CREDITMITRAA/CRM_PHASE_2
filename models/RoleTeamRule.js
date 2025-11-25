const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('RoleTeamRule', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    creator_role_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Roles',
        key: 'id'
      },
      allowNull: false
    },
    allowed_member_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Roles',
        key: 'id'
      },
      allowNull: false
    }
  }, { 
    timestamps: true,
    tableName: 'RoleTeamRules'
  });
};