// models/ActivityLog.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'ProfileImageUrl',
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      profile_image_urls: {type: DataTypes.STRING, allowNull: true},
      gender: {
        type: DataTypes.ENUM('male', 'female'),
        defaultValue: 'male',
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('active', 'deleted'),
        defaultValue: 'active',
        allowNull: false,
      },
    },
    { timestamps: true }
  );
};
