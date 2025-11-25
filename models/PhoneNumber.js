// models/PhoneNumber.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PhoneNumber = sequelize.define('PhoneNumber', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    phone: { 
      type: DataTypes.STRING(15), 
      allowNull: false,
      validate: {
        notEmpty: true
      }
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
    tableName: 'phone_numbers'
  });

  return PhoneNumber;
};