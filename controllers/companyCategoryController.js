const { CompanyCategory } = require("../models");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

async function getAllCompanyCategories(req, res) {
  try {
    const categories = await CompanyCategory.findAll();
    return ApiResponse(
      res,
      "success",
      200,
      "categories retrieved successfully",
      categories,
      null,
      null
    );
  } catch (error) {
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to fetch categories",
      null,
      error,
      null
    );
  }
}

async function addCategory(req, res) {
  try {
    // Destructure the name and status from the request body
    const { name, status } = req.body;

    // Validate that the name is provided
    if (!name) {
      return ApiResponse(res, "error", 400, "Category name is required!");
    }

    // Validate that the status is valid (active or deactive)
    const validStatuses = ["active", "deactive"];
    if (status && !validStatuses.includes(status)) {
      return ApiResponse(
        res,
        "error",
        400,
        "Invalid category status! Must be 'active' or 'deactive'."
      );
    }

    // Create the new company category
    const newCategory = await CompanyCategory.create({
      name,
      status: status || "active", // Default to 'active' if no status is provided
    });

    // Return the created category
    return ApiResponse(
      res,
      "success",
      201,
      "Company category created successfully",
      newCategory
    );
  } catch (error) {
    console.error("Error adding category:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Faile to add company category",
      null,
      error
    );
  }
}

async function deleteCategory(req, res) {
  try {
    const { categoryId } = req.params;

    // Validate that the categoryId is provided
    if (!categoryId) {
      return ApiResponse(res, "error", 400, "Category ID is required!");
    }

    // Check if the category exists before attempting to delete
    const category = await CompanyCategory.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      return ApiResponse(res, "error", 404, "Category not found!");
    }

    // Delete the category
    await CompanyCategory.destroy({ where: { id: categoryId } });

    // Return a success response
    return ApiResponse(
      res,
      "success",
      200,
      "Company category deleted successfully"
    );
  } catch (error) {
    console.error("Error deleting category:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to delete company category",
      null,
      error.message
    );
  }
}

async function updateCategory(req, res) {
  try {
    const { categoryId } = req.params;
    const { name, status } = req.body;

    // Validate that required fields are provided
    if (!categoryId) {
      return ApiResponse(res, "error", 400, "Category ID is required!");
    }

    // Validate the name and status
    if (!name) {
      return ApiResponse(res, "error", 400, "Category name is required!");
    }

    const validStatuses = ["active", "deactive"];
    if (status && !validStatuses.includes(status)) {
      return ApiResponse(res, "error", 400, "Invalid category status!");
    }

    // Check if the category exists before updating
    const category = await CompanyCategory.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      return ApiResponse(res, "error", 404, "Category not found!");
    }

    // Update the category fields
    const updatedCategory = await category.update({
      name,
      status: status || category.status, // If no status is provided, keep the existing status
    });

    // Return the updated category data
    return ApiResponse(
      res,
      "success",
      200,
      "Category updated successfully",
      updatedCategory
    );
  } catch (error) {
    console.error("Error updating category:", error);
    return ApiResponse(
      res,
      "error",
      500,
      error?.message || "Failed to update company category",
      null,
      error.message
    );
  }
}

module.exports = {
  getAllCompanyCategories,
  addCategory,
  deleteCategory,
  updateCategory
};
