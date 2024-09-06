import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import User from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";

const registerUser = asyncHandler(async (req, res) => {
  // get user details
  const { email, username, fullName, password } = req.body;

  // validation
  if (
    [email, username, fullName, password].some((field) => {
      return field.trim() === "";
    })
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // check if user exists
  const isUserExist = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });

  if (isUserExist) throw new ApiError(409, "User already exists");

  // check for images
  const avatarLocalPath = req.files?.avatar[0]?.path;

  let coverImageLocalPath;

  if (req.files && req.files.coverImage && Array.isArray(req.files.coverImage) && req.files.coverImage[0] && req.files.coverImage[0].path) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }
  

  if (!avatarLocalPath) throw new ApiError(400, "Avatar is required 1");

  // upload images
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  const coverImage =
    coverImageLocalPath && (await uploadOnCloudinary(coverImageLocalPath));

  if (!avatar) throw new ApiError(400, "Avatar is required");

  // create user
  const user = await User.create({
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    fullName,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  // remove password and refresh token field from response
  // check if user created
  const isUserCreated = await User.findById(user?._id).select(
    "-password -refreshToken"
  );
  if (!isUserCreated) {
    throw new ApiError(500, "Failed to create user");
  }

  // return res
  return res
    .status(201)
    .json(new ApiResponse(200, isUserCreated, "Successfully created user"));
});

export { registerUser };
