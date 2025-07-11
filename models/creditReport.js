const { DataTypes } = require('sequelize');
const { LOAN_STATUS_OPTIONS, DISPUTE_STATUS_OPTIONS } = require('../utilities/constants');

module.exports = (sequelize) => {
  const CreditReport = sequelize.define('CreditReport', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lead_id: { type: DataTypes.INTEGER },
    credit_card_name: { type: DataTypes.STRING },
    total_outstanding: { type: DataTypes.DECIMAL(15, 2) },
    loan_status: {type: DataTypes.ENUM(...LOAN_STATUS_OPTIONS), 
      defaultValue: 'Not Closing' },
    closing_date: { type: DataTypes.DATE, allowNull: true },
    dispute_status: {type: DataTypes.ENUM(...DISPUTE_STATUS_OPTIONS) },
    dispute_date: { type: DataTypes.DATE, allowNull: true },
    status: { 
      type: DataTypes.ENUM('active', 'inactive', 'deleted'), 
      defaultValue: 'active' 
    },
    updated_by: { type: DataTypes.INTEGER },
    created_by: { type: DataTypes.INTEGER }
  }, { 
    timestamps: true,
    paranoid: true // Optional: enables soft deletion
  });

  return CreditReport;
};