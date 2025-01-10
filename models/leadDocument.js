const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LeadDocument",
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      lead_id: { type: DataTypes.INTEGER, allowNull: false },
      document_url: { type: DataTypes.STRING },
      document_type: { type: DataTypes.STRING },
      document_name: { type: DataTypes.STRING },
      updated_by: { type: DataTypes.INTEGER },
      created_by: { type: DataTypes.INTEGER },
      status: {
        type: DataTypes.ENUM("active", "inactive", "deleted"),
        defaultValue: "active",
      },
    },
    { timestamps: true }
  );
};
