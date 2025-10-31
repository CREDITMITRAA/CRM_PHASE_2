const sequelize = require("../config/db");
const User = require("./user")(sequelize);
const Role = require("./role")(sequelize);
const Lead = require("./lead")(sequelize);
const CompanyCategory = require("./companyCategory")(sequelize);
const LeadAssignment = require("./leadAssignment")(sequelize);
const Activity = require("./activity")(sequelize);
const UserSession = require("./userSession")(sequelize);
const LoanReport = require("./loanReport")(sequelize);
const CreditReport = require("./creditReport")(sequelize);
const InvalidLead = require("./invalidLead")(sequelize);
const WalkIn = require("./walkIn")(sequelize);
const LeadDocument = require("./leadDocument")(sequelize)
const ActivityLog = require("./ActivityLog")(sequelize)
const LeadTransfer = require("./LeadTransfer")(sequelize)
const Notification = require("./Notification")(sequelize)
const CallLog = require('./CallLog')(sequelize)
const UserMetrics = require('./UserMetrics')(sequelize)
const ProfileImageUrl = require('./ProfileImageUrl')(sequelize)
const LeadPartner = require('./LeadPartner')(sequelize)
const LoginDetail = require('./LoginDetail')(sequelize)
const PhoneNumber = require('./PhoneNumber')(sequelize)
const FcmToken = require("./FcmToken")(sequelize)

// Define Relationships
// User.belongsToMany(Role, { through: UserRole });
// Role.belongsToMany(User, { through: UserRole });
User.belongsTo(Role, { foreignKey: "role_id", as: "Role" });
Role.hasMany(User, { foreignKey: "role_id", as: "Users" });
User.hasMany(LeadAssignment, {
  foreignKey: "assigned_to",
  as: "AssignedLeads",
});

Lead.belongsTo(CompanyCategory, { foreignKey: "company_category_id" });
CompanyCategory.hasMany(Lead, { foreignKey: "company_category_id" });

Lead.hasMany(Activity, { foreignKey: "lead_id", as: "Activities" });
Lead.hasMany(LeadAssignment, { foreignKey: "lead_id", as: "LeadAssignments" });

LeadAssignment.belongsTo(Lead, { foreignKey: "lead_id", as: "Lead" });
LeadAssignment.belongsTo(User, { foreignKey: "assigned_to", as: "AssignedTo" });
LeadAssignment.belongsTo(User, { as: "assignedBy", foreignKey: "assigned_by" });

Activity.belongsTo(Lead, { foreignKey: "lead_id", as: "Lead" });
Activity.belongsTo(User, { foreignKey: "created_by", as: "CreatedBy" });

UserSession.belongsTo(User, { foreignKey: "user_id" });

LoanReport.belongsTo(Lead, { foreignKey: "lead_id" });
CreditReport.belongsTo(Lead, { foreignKey: "lead_id" });

Activity.hasMany(LeadAssignment, {
  foreignKey: "lead_id",
  as: "LeadAssignments",
});
LeadAssignment.belongsTo(Activity, { foreignKey: "lead_id", as: "Activity" });

Lead.hasMany(WalkIn, {
  foreignKey: "lead_id",
  as: "walkIns",
  onDelete: "CASCADE",
});
WalkIn.belongsTo(Lead, {
  foreignKey: "lead_id", // The foreign key in the WalkIn model
  as: "lead", // Alias for the association
});

Lead.hasMany(LeadDocument,{
  foreignKey: 'lead_id',
  as: 'documents'
})

LeadDocument.belongsTo(Lead, {
  foreignKey:'lead_id',
  as: 'lead'
})

Lead.hasMany(LoginDetail, {
  foreignKey: 'lead_id',
  as: 'loginDetails'
})

Lead.hasMany(LoginDetail, {
  foreignKey: 'lead_id',
  as: 'firstLogin', // specifically for the first login
  scope: {
    // You can add additional filters here if needed
  }
});

LoginDetail.belongsTo(Lead, {
  foreignKey: 'lead_id',
  as: 'lead'
})

Notification.belongsTo(User, { 
    foreignKey: 'employee_id', // Notification.employee_id
    targetKey: 'id',           // User.id (primary key)
    as: 'AssignedToUser'
});

User.hasMany(PhoneNumber, {
  foreignKey: 'user_id',
  as: 'phones',
  onDelete: 'CASCADE'
})

PhoneNumber.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
})

module.exports = {
  sequelize,
  User,
  Role,
  Lead,
  CompanyCategory,
  LeadAssignment,
  Activity,
  UserSession,
  LoanReport,
  CreditReport,
  InvalidLead,
  WalkIn,
  LeadDocument,
  ActivityLog,
  LeadTransfer,
  Notification,
  CallLog,
  UserMetrics,
  ProfileImageUrl,
  LeadPartner,
  LoginDetail,
  PhoneNumber,
  FcmToken
};
