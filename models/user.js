const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    employee_id: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(15) },
    address: { type: DataTypes.TEXT },
    password: { type: DataTypes.STRING, allowNull: false },
    salary: { type: DataTypes.DECIMAL(10, 2) },
    designation: { type: DataTypes.STRING },
    department: { type: DataTypes.STRING },
    working_mode: { type: DataTypes.ENUM('remote', 'office', 'hybrid') },
    date_of_join:{ type: DataTypes.STRING, allowNull: true },
    login_status : { type: DataTypes.ENUM('logged_in', 'logged_out') },
    last_login_at : { type: DataTypes.DATE, allowNull:true },
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' },
    profile_image_url : { type: DataTypes.STRING, allowNull: true },
    gender: { type: DataTypes.ENUM('male', 'female'),allowNull:true },
    role_id: {  // Add role_id here as a foreign key
      type: DataTypes.INTEGER,
      references: {
        model: 'Roles',  // Referencing the 'Roles' table
        key: 'id'        // The primary key in the Roles table
      },
      allowNull: false  // Make it mandatory
    }
  }, { timestamps: true });
};