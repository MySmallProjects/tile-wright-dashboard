echo # This will build both front end and backend so version numbers match
#
cd ..

dotnet build src/Tilewright.sln
npm --prefix src/web run build

echo # Run the site without building
dotnet run --no-build --project src/Tilewright.Server
