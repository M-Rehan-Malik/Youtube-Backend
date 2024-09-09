import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import User from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

const generateTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    return { refreshToken, accessToken };
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

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

  if (
    req.files &&
    req.files.coverImage &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage[0] &&
    req.files.coverImage[0].path
  ) {
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

const loginUser = asyncHandler(async (req, res) => {
  // get data
  const { email, password } = req.body;

  // email
  if (!email) throw new ApiError(400, "Email is required");

  // find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new ApiError(404, "User does not exist");

  // password check
  const isPasswordCorrect = await user.isPasswordCorrect(password);
  if (!isPasswordCorrect) throw new ApiError(401, "Invalid password");

  // generate access and refresh token
  const { accessToken, refreshToken } = await generateTokens(user._id);
  // update user with refresh token
  const loggedInUser = await User.findByIdAndUpdate(
    user._id,
    { refreshToken },
    { new: true }
  ).select("-password -refreshToken");

  // send cookies
  const options = {
    httpOnly: true,
    secure: true,
  };

  // return res
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "Successfully logged in"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "Successfully logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) throw new ApiError(401, "Unauthorized Request");

  const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET_KEY
  );

  const user = await User.findById(decodedToken?._id);
  if (!user) throw new ApiError(401, "Invalid Refresh Token");

  if (incomingRefreshToken !== user?.refreshToken)
    throw new ApiError(401, "Refresh token not valid");

  const { refreshToken, accessToken } = await generateTokens(user?._id);
  User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        refreshToken: refreshToken,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken,
        },
        "Successfully refreshed access token"
      )
    );
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  if (!user) throw new ApiError(401, "Invalid user");

  const isValidPassword = user.isPasswordCorrect(oldPassword);
  if (!isValidPassword) throw new ApiError(400, "Invalid old password");

  user.password = newPassword;
  await user.save({
    validateBeforeSave: false,
  });

  return res.json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getUserDetails = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(200, req.user, "User details retrieved successfully")
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) throw new ApiError(400, "Username is missing");

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        subscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        fullName: 1,
        username: 1,
        avatar: 1,
        coverImage: 1,
        subscribersCount: 1,
        subscribedToCount: 1,
        isSubscribed: 1,
      }
    }
  ]);

  if (!channel?.length) throw new ApiError(404, "Channel does not exist");

  return res.status(200)
  .json(
    new ApiResponse(200, channel[0], "User channel fetched succesfully")
  );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changePassword,
  getUserDetails,
  getUserChannelProfile
};
