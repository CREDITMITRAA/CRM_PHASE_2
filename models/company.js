const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('company', {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        company_name: { type: DataTypes.TEXT, allowNull: false },
        company_category: { type: DataTypes.TEXT, allowNull: false },
    })
}