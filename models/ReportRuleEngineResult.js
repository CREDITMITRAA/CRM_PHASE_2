const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportRuleEngineResult = sequelize.define('ReportRuleEngineResult', {
    id: { 
      type: DataTypes.INTEGER, 
      autoIncrement: true, 
      primaryKey: true 
    },
    lead_id: { 
      type: DataTypes.INTEGER, 
      allowNull: false 
    },
    report_type: { 
      type: DataTypes.ENUM('CRIF', 'CIBIL', 'EXPERIAN', 'SCORE_CARD', 'OTHER', 'CRIF_PARSED'), 
      allowNull: false,
      comment: "SCORE_CARD: Basic eligibility criteria based on Company Category, Salary, and Age. Other types are credit bureau reports."
    },
    status: { 
      type: DataTypes.ENUM('APPROVED', 'REJECTED'), 
      allowNull: false 
    },
    reason: { 
      type: DataTypes.TEXT, 
      allowNull: true 
    },
    rejection_reasons: { 
      type: DataTypes.JSON, 
      defaultValue: [],
      allowNull: true 
    },
    dob: { 
      type: DataTypes.STRING, 
      allowNull: true 
    },
    repayment_history: { 
      type: DataTypes.JSON, 
      allowNull: true 
    },
    repayment_history_0_to_3_and_6_months: { 
      type: DataTypes.JSON, 
      allowNull: true 
    },
    updated_by: { 
      type: DataTypes.INTEGER 
    },
    created_by: { 
      type: DataTypes.INTEGER 
    },
    record_status: { 
      type: DataTypes.ENUM('active', 'inactive'), 
      defaultValue: 'active' 
    }
  }, { 
    timestamps: true,
    paranoid: true // Enables soft deletion
  });

  return ReportRuleEngineResult;
};

