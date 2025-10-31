const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "FcmToken",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      fcmToken: { type: DataTypes.STRING, allowNull: false },
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: "Users", 
          key: "id",
        },
        allowNull: false,
        unique: true
      },
    },
    { timestamps: true }
  );
};
