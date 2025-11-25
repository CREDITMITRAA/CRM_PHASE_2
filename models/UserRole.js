const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('UserRole', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    user_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Users',
        key: 'id'
      },
      allowNull: false
    },
    role_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Roles',
        key: 'id'
      },
      allowNull: false
    }
  }, { 
    timestamps: true,
    tableName: 'UserRoles'
  });
};