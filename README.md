# InkOnEarth

项目最初的设想是在地图上显示旅行轨迹，也就是选择两个城市并连线，形成一个轨迹图。
其中，个人认为CartoDB Voyager提供的地图格式相对美观，但是其需要api，在Stadia Maps中能够获取两周的临时api。
在制作的过程中，突发奇想：是否可以用这些轨迹组成特定的图案，比如汉字？
于是在原来的基础上加以改进，
对于中国各地级和县级区划的经纬度，可以在阿里云（https://geo.datav.aliyun.com/areas_v3/bound/all.json）中得到json文件，导入到项目中。

