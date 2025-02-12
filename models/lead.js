const { DataTypes } = require('sequelize');
const { LEAD_STATUSES, VERIFICATION_STATUSES, APPLICATION_STATUSES } = require('../utilities/constants');

module.exports = (sequelize) => {
  return sequelize.define('Lead', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING(15), unique:true, allowNull:false},
    city: { type: DataTypes.STRING },
    company: { type: DataTypes.STRING },
    lead_source: { type: DataTypes.STRING },
    company_category_id: { type: DataTypes.INTEGER },
    salary: { type: DataTypes.DECIMAL(10, 2) },
    verification_status: { 
      type: DataTypes.ENUM(...VERIFICATION_STATUSES), // Spread the array values into the ENUM type
      defaultValue: 'Under Review' // Set a default value
    },
    lead_status: { type: DataTypes.ENUM(...LEAD_STATUSES), defaultValue: 'Not Contacted' },
    application_status : { type: DataTypes.ENUM(...APPLICATION_STATUSES) },
    is_rejected: { type: DataTypes.BOOLEAN, defaultValue: false },
    rejection_reason: { type: DataTypes.TEXT },
    rejected_by_id: { type: DataTypes.INTEGER },
    rejected_at : {type: DataTypes.DATE},
    verification_status_note : {type:DataTypes.TEXT},
    application_status_note: {type:DataTypes.TEXT},
    updated_by: { type: DataTypes.INTEGER },
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
  }, { timestamps: true });
};
